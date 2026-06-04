import { POSITIONS, type getPositionInput } from "../exchangeStore";

export function handleGetPosition(message : Record<string,unknown>){
    const {userId, symbol} = message as unknown as getPositionInput

    const userPosition = POSITIONS.get(userId)
        if(!userPosition) throw new Error("No Postions of the user")

           const position = userPosition[symbol]

           return {
            position
           }
}