import { createUserSchema, loginUserSchema } from "@/validators/user.validator"
import prisma from "@perps-turbo-repo/db"
import {  type Request, type Response } from "express"
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { env } from "@perps-turbo-repo/env/server"

export async function userSignup(req:Request,res:Response){
     const body = createUserSchema.safeParse(req.body)
    if (!body.success) {
        return res.status(400).json({
            error: body.error
        })
    }

    const data = body.data

    const existingUser = await prisma.user.findUnique({
        where: {
            email: data.email
        }
    })

    if (existingUser) {
        return res.status(409).json({
            error: "User already exists"
        })
    }

    const hashedPassword = bcrypt.hashSync(data.password, 10)


    const user = await prisma.user.create({
        data: {
            email: data.email,
            name: data.name,
            password: hashedPassword
        }
    })
    res.status(201).json({
        id: user.id,
        email: user.email,
        name: user.name
    })
}

export async function userSignin(req: Request ,res: Response){
    const body = loginUserSchema.safeParse(req.body)

    if (!body.success) {
        return res.status(400).json({
            error: body.error
        })
    }

    const data = body.data
    const user = await prisma.user.findUnique({
        where: {
            email: data.email
        }
    })

    if (!user) {
        return res.status(401).json({
            error: "user does not exist"
        })
    }


    const passwordVerify = bcrypt.compareSync(data.password, user.password)

    if (!passwordVerify) {
        return res.status(401).json({
            error: "Incorrect Password"
        })
    }

    const token = jwt.sign(
        { userId: user.id },
        env.JWT_SECRET,
        { expiresIn: "7d" }
    )

    return res.status(200).json({
        token: `Bearer ${token}`,
        user: {
            id: user.id,
            email: user.email,
            name: user.name
        }
    })
}