import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { env } from "../config/env.js";

export const signUserJwt = (payload) => jwt.sign(payload, env.jwt.secret, { expiresIn: env.jwt.expiresIn });
export const verifyJwt = (token) => jwt.verify(token, env.jwt.secret);
export const hashPassword = (raw) => bcrypt.hash(raw, 10);
export const comparePassword = (raw, hash) => bcrypt.compare(raw, hash);
export const randomToken = () => crypto.randomBytes(32).toString("hex");
export const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
