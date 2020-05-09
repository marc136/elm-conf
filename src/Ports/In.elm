port module Ports.In exposing
    ( JoinSuccess
    , incoming
    , joinSuccess
    )

import Json.Decode as Json exposing (Decoder)


type alias JoinSuccess =
    { userId : Int
    -- , users : List User
    }


type alias User =
    { id : Int
    , name : String
    }


port incoming : (Json.Value -> msg) -> Sub msg



---- DECODERS ----


joinSuccess : Decoder JoinSuccess
joinSuccess =
    Json.map JoinSuccess
        (Json.field "userId" Json.int)
