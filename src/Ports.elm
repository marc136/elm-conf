port module Ports exposing
    ( attachMediaStream
    , createSdpAnswerFor
    , createSdpOfferFor
    , disconnectFromServer
    , getUserMedia
    , joinRoom
    , releaseUserMedia
    , setRemoteIceCandidate
    , setRemoteSdpAnswer
    )

import Json.Encode as Encode exposing (Value)


getUserMedia : Cmd msg
getUserMedia =
    send "getuserMedia" []


releaseUserMedia : Value -> Cmd msg
releaseUserMedia stream =
    send "releaseUserMedia" [ ( "stream", stream ) ]


joinRoom : String -> Cmd msg
joinRoom roomId =
    send "join" [ ( "room", Encode.string roomId ) ]


attachMediaStream : String -> Value -> Cmd msg
attachMediaStream id stream =
    send "attachStreamToId" [ ( "stream", stream ), ( "id", Encode.string id ) ]


disconnectFromServer : Cmd msg
disconnectFromServer =
    send "disconnect" []


createSdpOfferFor : Int -> Encode.Value -> Cmd msg
createSdpOfferFor id localStream =
    send "createSdpOffer"
        [ ( "for", Encode.int id )
        , ( "localStream", localStream )
        ]


createSdpAnswerFor : String -> Int -> Encode.Value -> Encode.Value -> Cmd msg
createSdpAnswerFor sdp id localStream webSocket =
    send "createSdpAnswer"
        [ ( "offer"
          , Encode.object
                [ ( "type", Encode.string "offer" )
                , ( "sdp", Encode.string sdp )
                ]
          )
        , ( "from", Encode.int id )
        , ( "localStream", localStream )
        , ( "ws", webSocket )
        ]


setRemoteSdpAnswer : String -> Int -> Encode.Value -> Cmd msg
setRemoteSdpAnswer sdp id pc =
    send "setRemoteSdpAnswer"
        [ ( "answer"
          , Encode.object
                [ ( "type", Encode.string "answer" )
                , ( "sdp", Encode.string sdp )
                ]
          )
        , ( "from", Encode.int id )
        , ( "pc", pc )
        ]


setRemoteIceCandidate : Int -> Encode.Value -> Encode.Value -> Cmd msg
setRemoteIceCandidate id candidate pc =
    send "setRemoteIceCandidate"
        [ ( "candidate", candidate )
        , ( "for", Encode.int id )
        , ( "pc", pc )
        ]


send : String -> List ( String, Encode.Value ) -> Cmd msg
send type_ list =
    ( "type", Encode.string type_ )
        :: list
        |> Encode.object
        |> out


port out : Value -> Cmd msg
