import { BALANCES, type onRampInput } from "../exchangeStore";

export function handleOnRamp(message: Record<string, unknown>){
    const {userId, symbol, amount} = message as unknown as onRampInput

    let userBalance = BALANCES.get(userId)

    if(!userBalance){
        userBalance = {}
        BALANCES.set(userId,userBalance)
    }

    if(!userBalance[symbol]){
        userBalance[symbol] = {
            available : 0,
            locked: 0,
        }
    }

    userBalance[symbol].available += amount;

    return {
        userId,
        symbol,
        balance: userBalance[symbol]
    }

}