module Active.Model exposing
    ( Browser
    , Callee
    , Caller
    , MediaTrack(..)
    , Model
    , Peer
    , PeerConnection
    , RoomId
    , Stream
    , User(..)
    , UserId
    , View(..)
    , WebSocket
    )

import Active.Messages as Msg
import Dict exposing (Dict)
import Json.Decode as Json


type alias Model =
    { room : RoomId
    , localStream : Stream
    , userId : UserId
    , users : Dict UserId User
    , socket : WebSocket
    , debug : Bool
    }


type alias RoomId =
    String


type alias Stream =
    Json.Value


type alias UserId =
    Int


type User
    = UserWithoutWebRtc
    | UserIsCallee Callee
    | UserIsCaller Caller
    | User Peer


type alias Callee =
    { id : UserId
    , browser : Browser
    }


type alias Caller =
    { id : UserId
    , browser : Browser
    , remoteSdpOffer : Maybe Msg.Sdp
    , remoteIceCandidates : List Msg.IceCandidate
    }


type alias Peer =
    { id : UserId
    , browser : Browser
    , pc : PeerConnection
    , audioTrack : MediaTrack
    , videoTrack : MediaTrack
    , view : View
    }


type alias Browser =
    { name : String
    , version : Int
    }


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
