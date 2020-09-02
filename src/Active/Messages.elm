module Active.Messages exposing
    ( IceCandidate
    , MediaKind(..)
    , MediaTrack
    , Msg(..)
    , Sdp
    , Updated(..)
    , User
    , UserId
    , VideoState(..)
    , gotTrackDecoder
    , peerConnectionDecoder
    , portDecoder
    , userDecoder
    , videoStateDecoder
    )

import Json.Decode as Json exposing (Decoder)


type alias UserId =
    Int


type Msg
    = SetDebug Bool
    | UserJoined User
    | UserLeft UserId
    | UserUpdated UserId Updated
    | Leave


type alias User =
    { id : UserId
    , supportsWebRtc : Bool
    , browser : String
    , browserVersion : Int
    }


type Updated
    = NewPeerConnection RtcPeerConnection
    | LocalSdpOffer Sdp
    | RemoteSdpOffer Sdp
    | LocalSdpAnswer Sdp
    | RemoteSdpAnswer Sdp
    | RemoteIceCandidate IceCandidate
    | GotTrack MediaKind MediaTrack
    | VideoEvent VideoState


type alias RtcPeerConnection =
    Json.Value


type alias Sdp =
    String


type alias IceCandidate =
    Json.Value


type MediaKind
    = Audio
    | Video


type alias MediaTrack =
    Json.Value


type VideoState
    = Playing
    | Stalled



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
    Json.map4 User
        (Json.field "userId" Json.int)
        (Json.field "supportsWebRtc" Json.bool)
        (Json.field "browser" Json.string)
        (Json.field "browserVersion" Json.int)


peerConnectionDecoder : Json.Decoder Updated
peerConnectionDecoder =
    Json.map NewPeerConnection Json.value


gotTrackDecoder : Json.Decoder Updated
gotTrackDecoder =
    Json.map2 GotTrack
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


videoStateDecoder : Json.Decoder Updated
videoStateDecoder =
    Json.map VideoEvent
        (Json.string |> Json.andThen videoState)


videoState : String -> Json.Decoder VideoState
videoState str =
    case str of
        "playing" ->
            Json.succeed Playing

        "stalled" ->
            Json.succeed Stalled

        _ ->
            Json.fail <| "Unknown video state event '" ++ str ++ "'"
