module Main exposing (main)

import Active
import Active.Messages as ActiveMsg
import Browser
import Helpers.View exposing (KeyedHtmlList, btn, keyedNode)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (onClick)
import Icons
import Json.Decode as Json
import Ports.In
import Ports.Log as Log
import Ports.Out



---- MODEL ----


type Model
    = SelectRoom SelectRoomData
    | InitialMediaSelection InitialMediaSelectionData
    | JoiningRoom JoiningRoomData
    | Active Active.Model
    | Ended


type alias SelectRoomData =
    { id : RoomId
    , supportsWebRtc : Bool
    , browser : String
    , browserVersion : Int
    }


type alias RoomId =
    String


type alias InitialMediaSelectionData =
    { room : RoomId
    , localStream : LocalStream
    }


type LocalStream
    = NotRequested
    | LocalStream Stream
    | Failed String


type alias Stream =
    Json.Value


type alias JoiningRoomData =
    { room : RoomId
    , localStream : Stream
    }


init : Flags -> ( Model, Cmd Msg )
init flags =
    ( SelectRoom
        { id = "123123"
        , supportsWebRtc = flags.supportsWebRtc
        , browser = flags.browser
        , browserVersion = flags.browserVersion
        }
    , Cmd.none
    )



---- UPDATE ----


type Msg
    = Join
    | AbortJoining
    | GotLocalStream LocalStream
    | JoinResponse Ports.In.JoinSuccess
    | ActiveMsg ActiveMsg.Msg
    | InvalidPortMsg Json.Error


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case ( msg, model ) of
        ( Join, SelectRoom { id } ) ->
            ( InitialMediaSelection { room = id, localStream = NotRequested }
            , Cmd.none
            )

        ( GotLocalStream value, InitialMediaSelection a ) ->
            ( InitialMediaSelection { a | localStream = value }, Cmd.none )

        ( Join, InitialMediaSelection { room, localStream } ) ->
            case localStream of
                LocalStream stream ->
                    ( JoiningRoom { room = room, localStream = stream }
                    , Ports.Out.joinRoom room
                    )

                _ ->
                    ( model, Cmd.none )

        ( AbortJoining, JoiningRoom { localStream } ) ->
            ( Ended, Ports.Out.releaseUserMedia localStream )

        ( JoinResponse data, JoiningRoom { room, localStream } ) ->
            ( Active <| Active.init data room localStream
            , Cmd.none
            )

        ( ActiveMsg ActiveMsg.Leave, Active { localStream } ) ->
            ( Ended
            , [ Ports.Out.disconnectFromServer
              , Ports.Out.releaseUserMedia localStream
              ]
                |> Cmd.batch
            )

        ( ActiveMsg event, Active data ) ->
            Active.update event data
                |> Tuple.mapFirst Active

        ( InvalidPortMsg err, _ ) ->
            ( model, Log.warn <| "InvalidPortMsg: " ++ Json.errorToString err )

        _ ->
            ( model, Log.warn "Received an unsupported event, check elm debugger" )



---- VIEW ----


view : Model -> Html Msg
view model =
    case model of
        SelectRoom data ->
            viewSelectRoom data

        InitialMediaSelection data ->
            viewInitialMediaSelection data

        JoiningRoom data ->
            keyedNode "div" <|
                viewJoiningRoom data

        Active data ->
            Active.view data
                |> keyedNode "div"
                |> Html.map ActiveMsg

        Ended ->
            div [] [ h1 [] [ text "You left the conference" ] ]


viewSelectRoom : SelectRoomData -> Html Msg
viewSelectRoom { supportsWebRtc, browser, browserVersion } =
    let
        ( icon, result ) =
            if supportsWebRtc then
                ( Icons.checkCircle, "Your browser supports WebRTC" )

            else
                ( Icons.alertCircle, "Your browser does not support WebRTC" )

        caption =
            result ++ " (" ++ browser ++ " " ++ String.fromInt browserVersion ++ ")"
    in
    div [ class "modal" ]
        [ h1 [] [ text "Conference" ]
        , p [ class "with-icon" ] [ icon, text caption ]
        , btn
            [ disabled (not supportsWebRtc), onClick Join, autofocus True ]
            [ text "Select Camera" ]
        ]


viewInitialMediaSelection : InitialMediaSelectionData -> Html Msg
viewInitialMediaSelection { localStream } =
    div [ class "modal" ]
        [ h1 [] [ text "Camera selection" ]
        , cameraSelect
        , btn [ onClick Join, disabled <| not <| hasStream localStream ]
            [ text "Looks good, I want to join" ]
        ]


cameraSelect : Html Msg
cameraSelect =
    node "camera-select"
        [ onCustomEvent "got-stream" GotLocalStream getUserMediaResult ]
        []


onCustomEvent : String -> (a -> msg) -> Json.Decoder a -> Html.Attribute msg
onCustomEvent event toMsg decoder =
    Html.Events.on event <| Json.map toMsg <| detailDecoder decoder


detailDecoder : Json.Decoder a -> Json.Decoder a
detailDecoder decoder =
    Json.field "detail" decoder


getUserMediaResult : Json.Decoder LocalStream
getUserMediaResult =
    Json.oneOf
        [ Json.map LocalStream <| Json.field "stream" Json.value
        , Json.map Failed <| Json.field "error" Json.string
        ]


hasStream : LocalStream -> Bool
hasStream local =
    case local of
        LocalStream _ ->
            True

        _ ->
            False


viewJoiningRoom : JoiningRoomData -> KeyedHtmlList Msg
viewJoiningRoom { localStream } =
    ( [ class "modal" ]
    , [ ( "h1", h1 [] [ text "Joining" ] )
      , ( "self-video"
        , node "self-video"
            [ property "src" localStream ]
            []
        )
      , ( "abort", btn [ onClick AbortJoining ] [ text "Abort" ] )
      ]
    )



---- SUBSCRIPTIONS ----


subscriptions : Model -> Sub Msg
subscriptions model =
    case model of
        JoiningRoom _ ->
            Ports.In.incoming (subscribe JoinResponse Ports.In.joinSuccess)

        Active _ ->
            Ports.In.incoming (subscribe ActiveMsg Ports.In.active)

        _ ->
            Sub.none


subscribe : (a -> Msg) -> Json.Decoder a -> Json.Value -> Msg
subscribe toMsg decoder value =
    case Json.decodeValue decoder value of
        Ok data ->
            toMsg data

        Err err ->
            InvalidPortMsg err



---- PROGRAM ----


main : Program Flags Model Msg
main =
    Browser.element
        { view = view
        , init = init
        , update = update
        , subscriptions = subscriptions
        }


type alias Flags =
    { supportsWebRtc : Bool
    , browser : String
    , browserVersion : Int
    }
