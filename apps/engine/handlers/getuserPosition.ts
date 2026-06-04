import { POSITIONS, type getUserPositionInput } from "../exchangeStore";

export function handleGetUserPosition(message : Record<string,unknown>){
    const {userId} = message as unknown as getUserPositionInput

    const userPosition = POSITIONS.get(userId)

    return {
        userPosition
    }
}