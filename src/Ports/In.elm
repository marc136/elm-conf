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
    { userId : UserId
    , users : List User
    , socket : Json.Value
    }


type alias User =
    { id : UserId
    , supportsWebRtc : Bool
    , pc : Json.Value
    , browser : String
    , browserVersion : Int
    }


type alias UserId =
    Int


type Active
    = UserMsg User
    | UserLeft UserId
    | LocalSdpOffer { for : UserId, sdp : String }
    | RemoteSdpOffer { from : UserId, sdp : String }
    | LocalSdpAnswer { for : UserId, sdp : String }
    | RemoteSdpAnswer { from : UserId, sdp : String }
    | RemoteIceCandidate { from : UserId, candidate : Json.Value }


port incoming : (Json.Value -> msg) -> Sub msg



---- DECODERS ----


joinSuccess : Decoder JoinSuccess
joinSuccess =
    Json.map3 JoinSuccess
        (Json.field "userId" Json.int)
        (Json.field "users" <| Json.list user)
        (Json.field "socket" Json.value)


user : Decoder User
user =
    Json.map5 User
        (Json.field "userId" Json.int)
        (Json.field "supportsWebRtc" Json.bool)
        (Json.field "pc" Json.value)
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

        "leave" ->
            Json.map UserLeft
                (Json.field "user" Json.int)

        "offer" ->
            Json.oneOf
                [ Json.map2
                    (\id description -> LocalSdpOffer { for = id, sdp = description })
                    (Json.field "for" Json.int)
                    (Json.field "sdp" Json.string)
                , Json.map2
                    (\id description -> RemoteSdpOffer { from = id, sdp = description })
                    (Json.field "from" Json.int)
                    (Json.field "sdp" Json.string)
                ]

        "answer" ->
            Json.oneOf
                [ Json.map2
                    (\id description -> LocalSdpAnswer { for = id, sdp = description })
                    (Json.field "for" Json.int)
                    (Json.field "sdp" Json.string)
                , Json.map2
                    (\id description -> RemoteSdpAnswer { from = id, sdp = description })
                    (Json.field "from" Json.int)
                    (Json.field "sdp" Json.string)
                ]

        "ice-candidate" ->
            Json.map2
                (\id candidate -> RemoteIceCandidate { from = id, candidate = candidate })
                (Json.field "from" Json.int)
                (Json.field "candidate" Json.value)

        _ ->
            "Cannot decode message with type '"
                ++ type_
                ++ "'"
                |> Json.fail
