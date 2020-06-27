module Active.Messages exposing
    ( IceCandidate
    , MediaKind(..)
    , Msg(..)
    , Sdp
    , TrackEvent
    , Updated(..)
    , User
    , UserId
    , gotTrackDecoder
    , portDecoder
    , userDecoder
    )

import Json.Decode as Json exposing (Decoder)


type alias UserId =
    Int


type Msg
    = UserJoined User
    | UserLeft UserId
    | UserUpdated UserId Updated
    | Leave


type alias User =
    { id : UserId
    , supportsWebRtc : Bool
    , pc : Json.Value
    , browser : String
    , browserVersion : Int
    }


type Updated
    = LocalSdpOffer Sdp
    | RemoteSdpOffer Sdp
    | LocalSdpAnswer Sdp
    | RemoteSdpAnswer Sdp
    | RemoteIceCandidate IceCandidate
    | GotTrack TrackEvent


type alias Sdp =
    String


type alias IceCandidate =
    Json.Value


type alias TrackEvent =
    { kind : MediaKind
    , track : Json.Value
    }


type MediaKind
    = Audio
    | Video



---- DECODERS ----


portDecoder : String -> Decoder Msg
portDecoder type_ =
    case type_ of
        "user" ->
            Json.map UserJoined
                (Json.field "user" userDecoder)

        "leave" ->
            Json.map UserLeft
                (Json.field "user" Json.int)

        "offer" ->
            Json.oneOf
                [ Json.map2
                    (\id description -> UserUpdated id (LocalSdpOffer description))
                    (Json.field "for" Json.int)
                    (Json.field "sdp" Json.string)
                , Json.map2
                    (\id description -> UserUpdated id (RemoteSdpOffer description))
                    (Json.field "from" Json.int)
                    (Json.field "sdp" Json.string)
                ]

        "answer" ->
            Json.oneOf
                [ Json.map2
                    (\id description -> UserUpdated id (LocalSdpAnswer description))
                    (Json.field "for" Json.int)
                    (Json.field "sdp" Json.string)
                , Json.map2
                    (\id description -> UserUpdated id (RemoteSdpAnswer description))
                    (Json.field "from" Json.int)
                    (Json.field "sdp" Json.string)
                ]

        "ice-candidate" ->
            Json.map2
                (\id candidate -> UserUpdated id (RemoteIceCandidate candidate))
                (Json.field "from" Json.int)
                (Json.field "candidate" Json.value)

        _ ->
            "Cannot decode message with type '"
                ++ type_
                ++ "'"
                |> Json.fail


userDecoder : Decoder User
userDecoder =
    Json.map5 User
        (Json.field "userId" Json.int)
        (Json.field "supportsWebRtc" Json.bool)
        (Json.field "pc" Json.value)
        (Json.field "browser" Json.string)
        (Json.field "browserVersion" Json.int)


gotTrackDecoder : Json.Decoder Updated
gotTrackDecoder =
    Json.map GotTrack trackEvent


trackEvent : Json.Decoder TrackEvent
trackEvent =
    Json.map2 TrackEvent
        (Json.field "kind" (Json.string |> Json.andThen mediaKind))
        (Json.field "track" Json.value)


mediaKind : String -> Json.Decoder MediaKind
mediaKind kind =
    case kind of
        "audio" ->
            Json.succeed Audio

        "video" ->
            Json.succeed Video

        _ ->
            Json.fail <| "Unknown media kind '" ++ kind ++ "'"
