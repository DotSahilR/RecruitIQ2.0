const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db");

const TOKEN_TTL = "7d";

function createToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    console.log(`[auth] register attempt email=${normalizedEmail}`);

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.rows.length > 0) {
      console.log(`[auth] register email=${normalizedEmail} -> conflict (already exists)`);
      return res.status(409).json({ error: "An HR account already exists for this email." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
      [String(name).trim(), normalizedEmail, passwordHash]
    );

    const user = result.rows[0];
    console.log(`[auth] register email=${normalizedEmail} -> created user=${user.id}`);
    return res.status(201).json({
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (err) {
    console.error("[auth] register error:", err);
    return res.status(500).json({ error: "Server error creating HR account." });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    console.log(`[auth] login attempt email=${normalizedEmail}`);

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const result = await pool.query(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      console.log(`[auth] login email=${normalizedEmail} -> not_found`);
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = result.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      console.log(`[auth] login email=${normalizedEmail} -> bad_password`);
      return res.status(401).json({ error: "Invalid email or password." });
    }

    console.log(`[auth] login email=${normalizedEmail} -> ok user=${user.id}`);
    return res.status(200).json({
      token: createToken(user),
      user: publicUser(user),
    });
  } catch (err) {
    console.error("[auth] login error:", err);
    return res.status(500).json({ error: "Server error logging in." });
  }
}

async function me(req, res) {
  console.log(`[auth] me user=${req.user.id}`);
  return res.status(200).json({ user: publicUser(req.user) });
}

module.exports = {
  register,
  login,
  me,
};
