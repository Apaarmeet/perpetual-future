import { createUserSchema, loginUserSchema } from "@/validators/user.validator";
import { Router } from "express";
import prisma from "@perps-turbo-repo/db";
import bcrypt from "bcrypt"

export const userRouter: Router = Router()


userRouter.post("/signup", async (req, res) => {

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

})
userRouter.post("/signin", async (req, res) => {
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
        res.status(400).json({
            error: "Incorrect Password"
        })
    }
})