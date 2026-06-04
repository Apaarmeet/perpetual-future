import { BALANCES, type getUserBalanceInput } from "../exchangeStore";

export function handleGetUserBalance(payload: Record<string, unknown>){
    const {userId} = payload as unknown as getUserBalanceInput

    const balance = BALANCES.get(userId)

    return {
        userId,
        balance
    }

}