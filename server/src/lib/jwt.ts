import * as jose from 'jose';
import { env } from '../config/env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface JwtPayload {
    sub: string;
    role: string;
    username: string;
    [key: string]: unknown;
}

/**
 * Sign a JWT token
 */
export async function signToken(payload: { sub: string; role: string; username: string }): Promise<string> {
    const token = await new jose.SignJWT(payload as jose.JWTPayload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(env.JWT_EXPIRES_IN)
        .sign(secret);

    return token;
}

/**
 * Verify a JWT token
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
    try {
        const { payload } = await jose.jwtVerify(token, secret);
        return payload as unknown as JwtPayload;
    } catch {
        return null;
    }
}

/**
 * Decode a token without validating (for debugging only)
 */
export function decodeToken(token: string): JwtPayload | null {
    try {
        const payload = jose.decodeJwt(token);
        return payload as unknown as JwtPayload;
    } catch {
        return null;
    }
}
