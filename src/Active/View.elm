module Active.View exposing (view)

import Active.Messages as Msg exposing (Msg)
import Active.Model as Model exposing (Model, User, UserId)
import Dict
import Helpers.View exposing (KeyedHtmlList, btn)
import Html as H exposing (Html)
import Html.Attributes as HA
import Html.Events as HE
import Json.Decode
import Json.Encode


view : Model -> KeyedHtmlList Msg
view model =
    ( [ HA.class <| "conf conf-" ++ String.fromInt (Dict.size model.users + 1)
      , HA.classList [ ( "debug", model.debug ) ]
      ]
    , [ ( "header", header model.debug )
      , ( "self-video"
        , H.node "self-video"
            [ HA.class "user-box"
            , HA.property "src" model.localStream
            ]
            []
        )
      ]
        ++ List.map keyedOtherUser (Dict.toList model.users)
    )


keyedOtherUser : ( UserId, User ) -> ( String, Html Msg )
keyedOtherUser ( userId, user ) =
    ( String.fromInt userId
    , case user of
        Model.UserWithoutWebRtc ->
            H.div [ HA.class "user-box" ]
                [ H.text "Cannot render user without WebRTC" ]

        Model.UserWithoutPeerConnection peer ->
            viewPending peer

        Model.User peer ->
            viewOtherUser peer
    )


viewPending : Model.PendingUser -> Html Msg
viewPending user =
    H.node "webrtc-media"
        [ HA.id <| "user-" ++ String.fromInt user.id
        , HA.class "user-box"
        , HA.attribute "view" <| viewToString Model.Initial
        , HA.attribute "action" "create-peer-connection"
        , HA.property "browser" <| Json.Encode.string <| userBrowser user.browser
        , onCustomEvent "new-peer-connection" (Msg.UserUpdated user.id) Msg.peerConnectionDecoder
        ]
        []


viewOtherUser : Model.Peer -> Html Msg
viewOtherUser user =
    H.node "webrtc-media"
        [ HA.id <| "user-" ++ String.fromInt user.id
        , HA.class "user-box"
        , HA.classList
            [ ( "yellow", user.view == Model.Stalled ) ]
        , HA.class <| "video-" ++ viewToString user.view
        , HA.attribute "view" <| viewToString user.view
        , HA.property "browser" <| Json.Encode.string <| userBrowser user.browser
        , HA.property "pc" user.pc
        , onCustomEvent "track" (Msg.UserUpdated user.id) Msg.gotTrackDecoder
        , onCustomEvent "video" (Msg.UserUpdated user.id) Msg.videoStateDecoder
        , onCustomEvent "new-peer-connection" (Msg.UserUpdated user.id) Msg.peerConnectionDecoder
        ]
        []


viewToString : Model.View -> String
viewToString viewState =
    case viewState of
        Model.Initial ->
            "initial"

        Model.Stalled ->
            "stalled"

        Model.Playing ->
            "playing"


userBrowser : Model.Browser -> String
userBrowser browser =
    browser.name


onCustomEvent : String -> (m -> Msg) -> Json.Decode.Decoder m -> H.Attribute Msg
onCustomEvent event toMsg decoder =
    HE.on event <|
        Json.Decode.map toMsg (Json.Decode.field "detail" decoder)


header : Bool -> Html Msg
header debug =
    H.div [ HA.class "header" ]
        [ btn [ HE.onClick Msg.Leave ] [ H.text "leave" ]
        , H.label [ HA.class "debug-btn" ]
            [ H.input
                [ HA.type_ "checkbox"
                , HA.checked debug
                , HE.onCheck Msg.SetDebug
                ]
                []
            , H.text "debug"
            ]
        ]
