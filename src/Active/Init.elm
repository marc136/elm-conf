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
        users
            |> List.map (\u -> ( u.id, initUser u ))
            |> Dict.fromList
    , socket = socket
    , debug = False
    }


initUser : Msg.User -> Model.User
initUser { id, supportsWebRtc, browser, browserVersion } =
    if not supportsWebRtc then
        Model.UserWithoutWebRtc

    else
        { id = id
        , browser = Model.Browser browser browserVersion
        , remoteSdpOffer = Nothing
        , remoteIceCandidates = []
        }
            |> Model.UserCallsMe
