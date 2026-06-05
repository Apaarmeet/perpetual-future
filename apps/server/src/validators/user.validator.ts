import z from "zod";

export const createUserSchema = z.object({
    email:z.email(),
    name:z.string(),
    password:z.string()
})

export const loginUserSchema = z.object({
    email:z.email(),
    password:z.string()
})