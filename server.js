const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const storePath = path.join(dataDir, "store.json");
const maxBodyBytes = 1024 * 1024;
const maxGroupSize = 2000;

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify({ profiles: [], group: { people: [], progress: {} } }, null, 2));
  }
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(storePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Il database locale non contiene dati validi.");
  }
  return {
    profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
    group: parsed.group && typeof parsed.group === "object" ? parsed.group : { people: [], progress: {} },
  };
}

function writeStore(nextState) {
  ensureStore();
  fs.writeFileSync(storePath, JSON.stringify(nextState, null, 2));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  if (payload === undefined || payload === null) {
    res.end();
    return;
  }
  res.end(JSON.stringify(payload));
}

function sendCaughtError(res, error, fallback) {
  const statusCode = error.statusCode || 400;
  sendJson(res, statusCode, {
    error: statusCode === 413 ? error.message : error.message || fallback,
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bodyBytes = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      bodyBytes += chunk.length;
      if (bodyBytes > maxBodyBytes) {
        if (!tooLarge) {
          tooLarge = true;
          const error = new Error("La richiesta supera la dimensione massima consentita.");
          error.statusCode = 413;
          reject(error);
        }
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
      const body = Buffer.concat(chunks).toString("utf8");
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Body JSON non valido."));
      }
    });
    req.on("error", reject);
  });
}

function isValidPhoto(photo) {
  return photo === "" ||
    (photo.length <= 300000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]*={0,2}$/.test(photo));
}

function isValidPerson(person) {
  return person && typeof person === "object" &&
    (typeof person.id === "string" && person.id.length > 0 ||
      typeof person.id === "number" && Number.isFinite(person.id)) &&
    typeof person.name === "string" && person.name.length > 0 && person.name.length <= 60 &&
    typeof person.profileId === "string" &&
    typeof person.hairColor === "string" && person.hairColor.length <= 40 &&
    typeof person.age === "string" &&
      /^(|1[89]|[2-9][0-9]|1[01][0-9]|120)$/.test(person.age) &&
    typeof person.rating === "number" && Number.isFinite(person.rating) &&
      person.rating >= 0 && person.rating <= 5 &&
    (person.palo === "Sì" || person.palo === "No") &&
    ["shoeRating", "glassesRating", "finalRating"].every((field) =>
      person[field] === undefined ||
      (typeof person[field] === "number" && person[field] >= 0.5 && person[field] <= 5 &&
        Number.isInteger(person[field] * 2))
    ) &&
    (person.evaluations === undefined || (Array.isArray(person.evaluations) &&
      person.evaluations.every((evaluation) => evaluation &&
        typeof evaluation.name === "string" && Number.isInteger(evaluation.rating) &&
        evaluation.rating >= 1 && evaluation.rating <= 5))) &&
    (person.details === undefined || (Array.isArray(person.details) &&
      person.details.every((detail) => detail &&
        typeof detail.label === "string" && typeof detail.value === "string")));
}

function calculateProgress(people) {
  return people.reduce((progress, person) => {
    if (person.palo === "No") {
      progress[person.profileId] = (progress[person.profileId] || 0) + 1;
    }
    return progress;
  }, {});
}

function sameRecord(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (pathname === "/health") {
    sendJson(res, 200, { ok: true, status: "online" });
    return;
  }

  if (req.method === "GET" && pathname === "/") {
    fs.readFile(path.join(rootDir, "index.html"), (error, content) => {
      if (error) {
        sendJson(res, 500, { error: "Impossibile leggere la pagina." });
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(content);
    });
    return;
  }

  if (req.method === "GET" &&
    (pathname === "/script.js" || pathname === "/style.css" ||
      pathname === "/firebase-config.js" || pathname === "/admin.js" ||
      pathname === "/firebase-admin.js" || pathname === "/admin.css" ||
      pathname === "/admin.html")) {
    const filePath = path.join(rootDir, pathname.slice(1));
    fs.readFile(filePath, (error, content) => {
      if (error) {
        sendJson(res, 500, { error: "Impossibile leggere un file dell'app." });
        return;
      }
      const contentType = pathname.endsWith(".css")
        ? "text/css; charset=utf-8"
        : pathname.endsWith(".html")
          ? "text/html; charset=utf-8"
          : "application/javascript; charset=utf-8";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(content);
    });
    return;
  }

  if (pathname === "/api/profiles") {
    if (req.method === "GET") {
      sendJson(res, 200, readStore().profiles);
      return;
    }
    if (req.method === "POST") {
      try {
        const body = await readBody(req);
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const photo = typeof body.photo === "string" ? body.photo : "";
        if (!name || name.length > 60) {
          sendJson(res, 400, { error: "Il nome è obbligatorio e deve contenere al massimo 60 caratteri." });
          return;
        }
        if (!isValidPhoto(photo)) {
          sendJson(res, 400, { error: "La foto non è valida o supera la dimensione massima." });
          return;
        }
        const store = readStore();
        const profile = { id: randomUUID(), name, photo };
        const nextProfiles = [...store.profiles, profile];
        writeStore({ ...store, profiles: nextProfiles });
        sendJson(res, 201, profile);
      } catch (error) {
        sendCaughtError(res, error, "Errore nel salvataggio del profilo.");
      }
      return;
    }
  }

  const profilePathPrefix = "/api/profiles/";
  if (req.method === "DELETE" && pathname.startsWith(profilePathPrefix)) {
    sendJson(res, 501, { error: "Il backend locale non supporta l'eliminazione dei profili." });
    return;
  }

  if (pathname === "/api/group") {
    if (req.method === "GET") {
      sendJson(res, 200, readStore().group);
      return;
    }
    if (req.method === "POST") {
      try {
        const body = await readBody(req);
        if (!body || typeof body !== "object" || Array.isArray(body) ||
          !Array.isArray(body.people) || body.people.length > maxGroupSize ||
          (body.deleteIds !== undefined && !Array.isArray(body.deleteIds)) ||
          body.people.some((person) => !isValidPerson(person))) {
          sendJson(res, 400, { error: "Dati gruppo non validi." });
          return;
        }
        if (body.deleteIds?.length) {
          sendJson(res, 501, { error: "Il backend locale non supporta l'eliminazione degli approcci." });
          return;
        }
        const store = readStore();
        const incomingPeople = new Map();
        for (const person of body.people) {
          const personId = String(person.id);
          if (incomingPeople.has(personId)) {
            sendJson(res, 400, { error: "Il gruppo contiene identificativi duplicati." });
            return;
          }
          incomingPeople.set(personId, person);
        }

        const existingPeople = new Map(
          store.group.people.map((person) => [String(person.id), person]),
        );
        for (const [personId, person] of incomingPeople) {
          const existingPerson = existingPeople.get(personId);
          if (existingPerson && !sameRecord(existingPerson, person)) {
            sendJson(res, 409, { error: "Un approccio è stato modificato da un altro dispositivo. Aggiorna la pagina." });
            return;
          }
        }

        const mergedPeople = [...store.group.people];
        for (const [personId, person] of incomingPeople) {
          if (!existingPeople.has(personId)) mergedPeople.push(person);
        }
        if (mergedPeople.length > maxGroupSize) {
          sendJson(res, 400, { error: "Il gruppo ha raggiunto il numero massimo di approcci." });
          return;
        }

        const nextGroup = { people: mergedPeople, progress: calculateProgress(mergedPeople) };
        writeStore({ ...store, group: nextGroup });
        sendJson(res, 200, nextGroup);
      } catch (error) {
        sendCaughtError(res, error, "Errore nel salvataggio della gara.");
      }
      return;
    }
  }

  sendJson(res, 404, { error: "Percorso non trovato." });
});

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";
server.listen(port, host, () => {
  const displayHost = host === "0.0.0.0" ? "localhost" : host;
  console.log(`Server in esecuzione su http://${displayHost}:${port}`);
  console.log(`Accesso alla sfida: http://${displayHost}:${port}/`);
  if (host === "0.0.0.0") {
    for (const addresses of Object.values(os.networkInterfaces())) {
      for (const address of addresses || []) {
        if (address.family === "IPv4" && !address.internal) {
          console.log(`Accesso dalla rete: http://${address.address}:${port}/`);
        }
      }
    }
  }
});
