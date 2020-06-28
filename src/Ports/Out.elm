port module Ports.Out exposing
    ( closeRemotePeerConnection
    , createSdpAnswerFor
    , createSdpOfferFor
    , disconnectFromServer
    , joinRoom
    , releaseUserMedia
    , setRemoteIceCandidate
    , setRemoteSdpAnswer
    )

import Json.Encode as Encode exposing (Value)


releaseUserMedia : Value -> Cmd msg
releaseUserMedia stream =
    send "releaseUserMedia" [ ( "stream", stream ) ]


joinRoom : String -> Cmd msg
joinRoom roomId =
    send "join" [ ( "room", Encode.string roomId ) ]


disconnectFromServer : Cmd msg
disconnectFromServer =
    send "disconnect" []


createSdpOfferFor : Int -> Encode.Value -> Encode.Value -> Cmd msg
createSdpOfferFor id pc localStream =
    send "createSdpOffer"
        [ ( "for", Encode.int id )
        , ( "pc", pc )
        , ( "localStream", localStream )
        ]


closeRemotePeerConnection : Encode.Value -> Cmd msg
closeRemotePeerConnection pc =
    send "closeRemotePeerConnection" [ ( "pc", pc ) ]


createSdpAnswerFor : String -> Int -> Encode.Value -> Encode.Value -> Cmd msg
createSdpAnswerFor sdp id pc localStream =
    send "createSdpAnswer"
        [ ( "offer"
          , Encode.object
                [ ( "type", Encode.string "offer" )
                , ( "sdp", Encode.string sdp )
                ]
          )
        , ( "from", Encode.int id )
        , ( "pc", pc )
        , ( "localStream", localStream )
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
