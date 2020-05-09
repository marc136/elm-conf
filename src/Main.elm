module Main exposing (main)

import Browser
import Const
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (onClick)
import Json.Decode as Json
import Json.Encode
import Ports
import Ports.In


---- MODEL ----


type Model
    = SelectRoom SelectRoomData
    | InitialMediaSelection InitialMediaSelectionData
    | JoiningRoom JoiningRoomData
    | Active ActiveData


type alias SelectRoomData =
    { id : RoomId }


type alias RoomId =
    String


type alias InitialMediaSelectionData =
    { room : RoomId, localStream : LocalStream }


type alias JoiningRoomData =
    { room : RoomId, localStream : Stream }


type alias ActiveData =
    { room : RoomId, localStream : LocalStream }


type LocalStream
    = NotRequested
    | LocalStream Stream
    | Failed


init : ( Model, Cmd Msg )
init =
    ( SelectRoom { id = "123123" }
    , Cmd.none
    )



---- UPDATE ----


type Msg
    = Join
    | GetUserMedia
    | ReleaseUserMedia
    | GotLocalStream Stream
    | JoinResponse Ports.In.JoinSuccess


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case ( msg, model ) of
        ( Join, SelectRoom { id } ) ->
            ( InitialMediaSelection { room = id, localStream = NotRequested }
            , Cmd.none
            )

        ( GetUserMedia, InitialMediaSelection _ ) ->
            ( model, Ports.getUserMedia )

        ( GotLocalStream value, InitialMediaSelection a ) ->
            ( InitialMediaSelection { a | localStream = LocalStream value }, Cmd.none )

        ( Join, InitialMediaSelection { room, localStream } ) ->
            case localStream of
                LocalStream stream ->
                    ( JoiningRoom { room = room, localStream = stream }
                    , [ Ports.joinRoom room
                      , Ports.attachMediaStream Const.ownVideoId stream
                      ]
                        |> Cmd.batch
                    )

                _ ->
                    ( model, Cmd.none )

        ( ReleaseUserMedia, InitialMediaSelection { localStream } ) ->
            ( model, releaseUserMedia localStream )

        ( ReleaseUserMedia, Active { localStream } ) ->
            ( model, releaseUserMedia localStream )

        other ->
            let
                _ =
                    Debug.log "ignore" other
            in
            ( model, Cmd.none )


releaseUserMedia : LocalStream -> Cmd msg
releaseUserMedia local =
    case local of
        LocalStream stream ->
            Ports.releaseUserMedia stream

        _ ->
            Cmd.none



---- VIEW ----


view : Model -> Html Msg
view model =
    case model of
        SelectRoom data ->
            viewSelectRoom data

        InitialMediaSelection data ->
            viewInitialMediaSelection data

        JoiningRoom data ->
            viewJoiningRoom data

        Active data ->
            viewActive data


viewSelectRoom : SelectRoomData -> Html Msg
viewSelectRoom model =
    div []
        [ h1 [] [ text "Your Elm App is working!" ]
        , p [] [ text "TODO: show if WebRTC is supported" ]
        , button [ onClick Join ] [ text "Join" ]
        ]


viewInitialMediaSelection : InitialMediaSelectionData -> Html Msg
viewInitialMediaSelection { localStream } =
    div []
        [ h1 [] [ text "Please select your camera" ]
        , node "camera-select" [ onGotStream ] []
        , button [ onClick ReleaseUserMedia ] [ text "release media" ]
        , button [ onClick Join, disabled <| not <| hasStream localStream ]
            [ text "Looks good, I want to join" ]
        ]


hasStream : LocalStream -> Bool
hasStream local =
    case local of
        LocalStream _ ->
            True

        _ ->
            False


viewJoiningRoom : JoiningRoomData -> Html Msg
viewJoiningRoom model =
    div []
        [ h1 [] [ text "Joining" ]
        , video
            [ autoplay True
            , property "muted" (Json.Encode.bool True)
            , id Const.ownVideoId
            ]
            []
        ]


viewActive : ActiveData -> Html Msg
viewActive model =
    Debug.todo "viewActive"


type alias Stream =
    -- TODO change to opaque value
    Json.Value


onGotStream : Attribute Msg
onGotStream =
    Html.Events.on "got-stream" (Json.map GotLocalStream gotStreamDecoder)


gotStreamDecoder : Json.Decoder Stream
gotStreamDecoder =
    detailDecoder (Json.field "stream" Json.value)


detailDecoder : Json.Decoder a -> Json.Decoder a
detailDecoder decoder =
    Json.field "detail" decoder


---- SUBSCRIPTIONS ----
subscriptions : Model -> Sub Msg
subscriptions model =
    case model of
        JoiningRoom _ ->
            Ports.In.incoming subscribeTo

        _ ->
            Sub.none


subscribeTo value =
    case Json.decodeValue Ports.In.joinSuccess value of
        Ok data ->
            let _ = Debug.log "got joinSuccess data" data in
            JoinResponse data
        Err err ->
            let _ = Debug.log "json decoder error" err in
            Debug.todo "json decoder error"


---- PROGRAM ----


main : Program () Model Msg
main =
    Browser.element
        { view = view
        , init = \_ -> init
        , update = update
        , subscriptions = subscriptions
        }


