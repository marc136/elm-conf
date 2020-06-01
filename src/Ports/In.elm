port module Ports.In exposing
    ( Active(..)
    , JoinSuccess
    , User
    , active
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
    , supportsWebRtc : Bool
    , browser : String
    , browserVersion : Int
    }


type Active
    = UserMsg User
    | LocalSdpOffer { for : Int, sdp : String }


port incoming : (Json.Value -> msg) -> Sub msg



---- DECODERS ----


joinSuccess : Decoder JoinSuccess
joinSuccess =
    Json.map2 JoinSuccess
        (Json.field "userId" Json.int)
        (Json.field "users" <| Json.list user)


user : Decoder User
user =
    Json.map4 User
        (Json.field "userId" Json.int)
        (Json.field "supportsWebRtc" Json.bool)
        (Json.field "browser" Json.string)
        (Json.field "browserVersion" Json.int)


active : Decoder Active
active =
    Json.field "type" Json.string
        |> Json.andThen activeDecoders


activeDecoders : String -> Decoder Active
activeDecoders type_ =
    case type_ of
        "user" ->
            Json.map UserMsg
                (Json.field "user" user)

        "sdp-offer" ->
            Json.map2
                (\for description -> LocalSdpOffer { for = for, sdp = description })
                (Json.field "for" Json.int)
                (Json.field "sdp" Json.string)

        _ ->
            "Cannot decode message with type '"
                ++ type_
                ++ "'"
                |> Json.fail
