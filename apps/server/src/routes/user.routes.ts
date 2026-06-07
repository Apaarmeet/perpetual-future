import { userSignin, userSignup } from "@/controllers/user.controller";
import { Router } from "express";


export const userRouter: Router = Router()


userRouter.post("/signup", userSignup)
userRouter.post("/signin", userSignin)
