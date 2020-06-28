module Active.Model exposing
    ( MediaTrack(..)
    , Model
    , PeerConnection
    , RoomId
    , Stream
    , User
    , UserId
    , View(..)
    , WebRtcSupport(..)
    , WebSocket
    )

import Dict exposing (Dict)
import Json.Decode as Json


type alias Model =
    { room : RoomId
    , localStream : Stream
    , userId : UserId
    , users : Dict UserId User
    , socket : WebSocket
    }


type alias RoomId =
    String


type alias Stream =
    Json.Value


type alias UserId =
    Int


type alias User =
    { id : UserId
    , webRtcSupport : WebRtcSupport
    , pc : PeerConnection
    , audioTrack : MediaTrack
    , videoTrack : MediaTrack
    , view : View
    }


type WebRtcSupport
    = NoWebRtcSupport
    | SupportsWebRtc String Int


type alias PeerConnection =
    Json.Value


type MediaTrack
    = NoTrack
    | MediaTrack Json.Value


type View
    = Initial
    | Stalled
    | Playing


type alias WebSocket =
    Json.Value
