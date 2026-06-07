import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken"
import { env } from "@perps-turbo-repo/env/server";
import prisma from "@perps-turbo-repo/db";


interface MyTokenPayload extends JwtPayload {
    userId: string;
}

export async function middleware(req: Request, res: Response, next: NextFunction) {
    const authHeaders = req.headers['authorization']

    const token = authHeaders?.split(" ")[1]

    if (!token) {
        return res.status(401).json({
            error: "Token not found"
        })
    }

    const verify = jwt.verify(token, env.JWT_SECRET) as MyTokenPayload


    if (!verify) {
        return res.status(401).json({
            error: "Unauthorised"
        })
    }

    const userId = verify.userId


    const user = await prisma.user.findUnique({
        where: {
            id: userId
        }
    })

    if (!user) {
        return res.status(401).json({
            error: "User not found"
        })
    }

    req.user = user

    next()
}