module Main exposing (main)

import Browser
import Const
import Dict exposing (Dict)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (onClick)
import Html.Keyed
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
    | Ended


type alias SelectRoomData =
    { id : RoomId }


type alias RoomId =
    String


type alias InitialMediaSelectionData =
    { room : RoomId, localStream : LocalStream }


type alias JoiningRoomData =
    { room : RoomId, localStream : Stream }


type alias ActiveData =
    { room : RoomId
    , localStream : LocalStream
    , userId : UserId
    , users : Dict UserId User
    , socket : WebSocket
    }


type alias UserId =
    Int


type alias User =
    { id : UserId
    , webRtcSupport : WebRtcSupport
    , pc : PeerConnection
    }


type PeerConnection
    = PeerConnection Json.Value
    | QueuedIceCandidates (List IceCandidate)


type alias IceCandidate =
    Json.Value


initUser : Ports.In.User -> User
initUser { id, supportsWebRtc, browser, browserVersion } =
    { id = id
    , webRtcSupport =
        if supportsWebRtc then
            SupportsWebRtc browser browserVersion

        else
            NoWebRtcSupport
    , pc = QueuedIceCandidates []
    }


type WebRtcSupport
    = NoWebRtcSupport
    | SupportsWebRtc String Int


type LocalStream
    = NotRequested
    | LocalStream Stream
    | Failed


type alias WebSocket =
    Json.Value


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
    | ActiveMsg Ports.In.Active
    | Leave
    | InvalidPortMsg Json.Error


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

        ( JoinResponse { userId, users, socket }, JoiningRoom { room, localStream } ) ->
            ( Active
                { room = room
                , localStream = LocalStream localStream
                , userId = userId
                , users =
                    List.map initUser users
                        |> List.map (\u -> ( u.id, u ))
                        |> Dict.fromList
                , socket = socket
                }
            , Cmd.none
            )

        ( ReleaseUserMedia, Active { localStream } ) ->
            ( model, releaseUserMedia localStream )

        ( Leave, Active _ ) ->
            ( Ended, Ports.disconnectFromServer )

        ( ActiveMsg sub, Active data ) ->
            activeUpdate sub data
                |> Tuple.mapFirst Active

        ( InvalidPortMsg err, _ ) ->
            let
                _ =
                    Debug.log "json decoder error" err
            in
            ( model, Cmd.none )

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


activeUpdate : Ports.In.Active -> ActiveData -> ( ActiveData, Cmd msg )
activeUpdate msg model =
    case msg of
        Ports.In.UserMsg u ->
            if u.id == model.userId then
                -- for now the server will not give us new data about oneself
                ( model, Cmd.none )

            else if Dict.member u.id model.users then
                -- for now we do not expect new data about other users
                ( model, Cmd.none )

            else
                -- another user has joined, create a PeerConnection to her
                ( { model | users = Dict.insert u.id (initUser u) model.users }
                , case model.localStream of
                    LocalStream stream ->
                        Ports.createSdpOfferFor u.id stream

                    _ ->
                        Cmd.none
                )

        Ports.In.NewPeerConnection { for, pc } ->
            case Dict.get for model.users of
                Nothing ->
                    -- TODO release pc because user has left the session
                    ( model, Cmd.none )

                Just user ->
                    ( { model
                        | users =
                            Dict.insert for
                                { user | pc = PeerConnection pc }
                                model.users
                      }
                    , case user.pc of
                        QueuedIceCandidates [] ->
                            Cmd.none

                        QueuedIceCandidates candidates ->
                            List.map
                                (\c -> Ports.setRemoteIceCandidate for c pc)
                                candidates
                                |> Cmd.batch

                        _ ->
                            Cmd.none
                    )

        Ports.In.LocalSdpOffer { for, sdp } ->
            case Dict.get for model.users of
                Just user ->
                    let
                        _ =
                            Debug.log "LocalSdpOffer is ignored in elm" sdp
                    in
                    ( model, Cmd.none )

                Nothing ->
                    ( model, Cmd.none )

        Ports.In.RemoteSdpOffer { from, sdp } ->
            case Dict.get from model.users of
                Just _ ->
                    ( model
                    , case model.localStream of
                        LocalStream stream ->
                            Ports.createSdpAnswerFor sdp from stream model.socket

                        _ ->
                            Cmd.none
                    )

                Nothing ->
                    ( model, Cmd.none )

        Ports.In.LocalSdpAnswer { for, sdp } ->
            case Dict.get for model.users of
                Just user ->
                    let
                        _ =
                            Debug.log "LocalSdpAnswer is ignored in elm" sdp
                    in
                    ( model, Cmd.none )

                Nothing ->
                    ( model, Cmd.none )

        Ports.In.RemoteSdpAnswer { from, sdp } ->
            case Dict.get from model.users of
                Just user ->
                    ( model
                    , case user.pc of
                        PeerConnection pc ->
                            Ports.setRemoteSdpAnswer sdp from pc

                        _ ->
                            Cmd.none
                    )

                Nothing ->
                    ( model, Cmd.none )

        Ports.In.RemoteIceCandidate { from, candidate } ->
            case Dict.get from model.users of
                Just user ->
                    case user.pc of
                        QueuedIceCandidates list ->
                            ( { model
                                | users =
                                    Dict.insert from
                                        { user | pc = QueuedIceCandidates (candidate :: list) }
                                        model.users
                              }
                            , Cmd.none
                            )

                        PeerConnection pc ->
                            ( model
                            , Ports.setRemoteIceCandidate from candidate pc
                            )

                Nothing ->
                    ( model, Cmd.none )



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
            keyedNode "div" <|
                viewActive data

        Ended ->
            div [] [ h1 [] [ text "You left the conference" ] ]


keyedNode : String -> KeyedHtmlList msg -> Html msg
keyedNode tagName ( attr, children ) =
    Html.Keyed.node tagName attr children


type alias KeyedHtmlList msg =
    ( List (Html.Attribute msg), List ( String, Html msg ) )


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


viewJoiningRoom : JoiningRoomData -> KeyedHtmlList Msg
viewJoiningRoom model =
    ( []
    , [ ( "h1", h1 [] [ text "Joining" ] )
      , ( Const.ownVideoId
        , video
            [ autoplay True
            , property "muted" (Json.Encode.bool True)
            , id Const.ownVideoId
            ]
            []
        )
      ]
    )


viewActive : ActiveData -> KeyedHtmlList Msg
viewActive model =
    ( []
    , [ ( "header", header )
      , ( Const.ownVideoId
        , video
            [ autoplay True
            , property "muted" (Json.Encode.bool True)
            , id Const.ownVideoId
            ]
            []
        )
      ]
    )


header : Html Msg
header =
    div []
        [ button [ onClick Leave ] [ text "leave" ]
        ]


button : List (Html.Attribute msg) -> List (Html msg) -> Html msg
button attr children =
    Html.button (type_ "button" :: attr) children


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


main : Program () Model Msg
main =
    Browser.element
        { view = view
        , init = \_ -> init
        , update = update
        , subscriptions = subscriptions
        }
