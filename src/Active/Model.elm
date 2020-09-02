module Active.Model exposing
    ( Browser
    , MediaTrack(..)
    , Model
    , Peer
    , PeerConnection
    , PendingUser
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
    | UserWithoutPeerConnection PendingUser
    | User Peer


type alias PendingUser =
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
