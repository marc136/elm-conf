port module Ports.In exposing
    ( JoinSuccess
    , active
    , incoming
    , joinSuccess
    )

import Active.Messages as ActiveMsg
import Json.Decode as Json exposing (Decoder)


type alias JoinSuccess =
    { userId : ActiveMsg.UserId
    , users : List ActiveMsg.User
    , socket : Json.Value
    }


port incoming : (Json.Value -> msg) -> Sub msg



---- DECODERS ----


joinSuccess : Decoder JoinSuccess
joinSuccess =
    Json.map3 JoinSuccess
        (Json.field "userId" Json.int)
        (Json.field "users" <| Json.list ActiveMsg.userDecoder)
        (Json.field "socket" Json.value)


active : Decoder ActiveMsg.Msg
active =
    Json.field "type" Json.string
        |> Json.andThen ActiveMsg.portDecoder
