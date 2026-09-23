import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const DATA_DIR = path.resolve(process.env.PRESIDO_DATA_DIR || "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const sessions = new Map();

async function loadUsers() {
  try { return JSON.parse(await readFile(USERS_FILE, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}

async function saveUsers(users) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

function validateCredentials(username, password) {
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) throw new Error("Username must be 3-32 characters and use only letters, numbers, hyphens or underscores.");
  if (typeof password !== "string" || password.length < 8 || password.length > 128) throw new Error("Password must be 8-128 characters.");
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return salt.toString("hex") + ":" + Buffer.from(key).toString("hex");
}

async function verifyPassword(password, storedHash) {
  const [saltHex, keyHex] = storedHash.split(":");
  if (!saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  const actual = Buffer.from(key);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function registerUser(username, password) {
  username = String(username || "").trim();
  validateCredentials(username, password);
  const users = await loadUsers();
  if (users[username]) throw new Error("Username is already registered.");
  users[username] = { username, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() };
  await saveUsers(users);
  return { username };
}

export async function loginUser(username, password) {
  username = String(username || "").trim();
  const users = await loadUsers();
  const exactUser = users[username];
  const matchedKey = exactUser ? username : Object.keys(users).find((key) => key.toLowerCase() === username.toLowerCase());
  const user = exactUser || (matchedKey ? users[matchedKey] : null);
  if (!user || !(await verifyPassword(password, user.passwordHash))) throw new Error("Invalid username or password.");
  const token = randomBytes(32).toString("hex");
  const canonicalUsername = user.username;
  sessions.set(token, canonicalUsername);
  return { username: canonicalUsername, token };
}

export function getUserFromToken(token) { return token ? sessions.get(token) || null : null; }
export function logoutUser(token) { if (token) sessions.delete(token); }
