port module Ports.In exposing
    ( JoinSuccess
    , User
    , incoming
    , joinSuccess
    )

import Json.Decode as Json exposing (Decoder)


type alias JoinSuccess =
    { userId : Int
    , users : List User
    }


type alias User =
    { id : Int
    }


port incoming : (Json.Value -> msg) -> Sub msg



---- DECODERS ----


joinSuccess : Decoder JoinSuccess
joinSuccess =
    Json.map2 JoinSuccess
        (Json.field "userId" Json.int)
        (Json.field "users" <| Json.list user)


user : Decoder User
user =
    Json.map User
        (Json.field "userId" Json.int)
