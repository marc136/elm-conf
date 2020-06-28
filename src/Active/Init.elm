module Active.Init exposing (init, initUser)

import Active.Messages as Msg
import Active.Model as Model exposing (Model)
import Dict
import Ports.In


init : Ports.In.JoinSuccess -> String -> Model.Stream -> Model
init { userId, users, socket } room stream =
    { room = room
    , localStream = stream
    , userId = userId
    , users =
        List.map initUser users
            |> List.map (\u -> ( u.id, u ))
            |> Dict.fromList
    , socket = socket
    }


initUser : Msg.User -> Model.User
initUser { id, supportsWebRtc, pc, browser, browserVersion } =
    { id = id
    , webRtcSupport =
        if supportsWebRtc then
            Model.SupportsWebRtc browser browserVersion

        else
            Model.NoWebRtcSupport
    , pc = pc
    , audioTrack = Model.NoTrack
    , videoTrack = Model.NoTrack
    , view = Model.Initial
    }
