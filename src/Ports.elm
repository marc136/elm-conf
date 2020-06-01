port module Ports exposing
    ( attachMediaStream
    , disconnectFromServer
    , getUserMedia
    , joinRoom
    , releaseUserMedia
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


send : String -> List ( String, Encode.Value ) -> Cmd msg
send type_ list =
    ( "type", Encode.string type_ )
        :: list
        |> Encode.object
        |> out


port out : Value -> Cmd msg
