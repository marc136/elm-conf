module Main exposing (main)

import Browser
import Const
import Dict exposing (Dict)
import Html exposing (..)
import Html.Attributes exposing (..)
import Html.Events exposing (onClick)
import Html.Keyed
import Icons
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
    { id : RoomId
    , supportsWebRtc : Bool
    , browser : String
    , browserVersion : Int
    }


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
    , media : MediaTracks
    }


type alias PeerConnection =
    Json.Value


type alias IceCandidate =
    Json.Value


type alias MediaTracks =
    { audio : MediaTrack
    , video : MediaTrack
    }


type MediaTrack
    = NoTrack
    | MediaTrack Json.Value


initUser : Ports.In.User -> User
initUser { id, supportsWebRtc, pc, browser, browserVersion } =
    { id = id
    , webRtcSupport =
        if supportsWebRtc then
            SupportsWebRtc browser browserVersion

        else
            NoWebRtcSupport
    , pc = pc
    , media = { audio = NoTrack, video = NoTrack }
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

        ( Leave, Active { localStream } ) ->
            ( Ended
            , [ Ports.disconnectFromServer
              , releaseUserMedia localStream
              ]
                |> Cmd.batch
            )

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
                -- another user has joined
                ( { model | users = Dict.insert u.id (initUser u) model.users }
                , case model.localStream of
                    LocalStream stream ->
                        -- initiate the PeerConnection to her
                        Ports.createSdpOfferFor u.id u.pc stream

                    _ ->
                        Cmd.none
                )

        Ports.In.UserLeft userId ->
            case Dict.get userId model.users of
                Nothing ->
                    ( model, Cmd.none )

                Just user ->
                    ( { model | users = Dict.remove userId model.users }
                    , Ports.closeRemotePeerConnection user.pc
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
                Just { pc } ->
                    ( model
                    , case model.localStream of
                        LocalStream stream ->
                            Ports.createSdpAnswerFor sdp from pc stream model.socket

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
                    , Ports.setRemoteSdpAnswer sdp from user.pc
                    )

                Nothing ->
                    ( model, Cmd.none )

        Ports.In.RemoteIceCandidate { from, candidate } ->
            case Dict.get from model.users of
                Just user ->
                    ( model
                    , Ports.setRemoteIceCandidate from candidate user.pc
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
        , button
            [ disabled (not supportsWebRtc), onClick Join, autofocus True ]
            [ text "Select Camera" ]
        ]


viewInitialMediaSelection : InitialMediaSelectionData -> Html Msg
viewInitialMediaSelection { localStream } =
    div [ class "modal" ]
        [ h1 [] [ text "Camera selection" ]
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
    ( [ class "modal" ]
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
    ( [ class <| "conf conf-" ++ String.fromInt (Dict.size model.users + 1) ]
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
        ++ List.map keyedOtherUser (Dict.toList model.users)
    )


keyedOtherUser : ( UserId, User ) -> ( String, Html Msg )
keyedOtherUser ( userId, user ) =
    ( String.fromInt userId
    , viewOtherUser user
    )


viewOtherUser : User -> Html Msg
viewOtherUser user =
    Html.node "webrtc-media"
        [ id <| "user-" ++ String.fromInt user.id
        , Html.Attributes.property "browser" <| Json.Encode.string <| userBrowser user.webRtcSupport
        , Html.Attributes.attribute "browserAttr" <| userBrowser user.webRtcSupport
        , Html.Attributes.property "pc" user.pc
        ]
        []


userBrowser : WebRtcSupport -> String
userBrowser support =
    case support of
        NoWebRtcSupport ->
            "unknown"

        SupportsWebRtc browser version ->
            browser


header : Html Msg
header =
    div [ class "header" ]
        [ button [ onClick Leave ] [ text "leave" ]
        ]


button : List (Html.Attribute msg) -> List (Html msg) -> Html msg
button attr children =
    Html.button (type_ "button" :: attr) children


type alias Stream =
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
