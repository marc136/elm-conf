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
    ( [ HA.class <| "conf conf-" ++ String.fromInt (Dict.size model.users + 1) ]
    , [ ( "header", header )
      , ( "self-video"
        , H.node "self-video"
            [ HA.property "src" model.localStream ]
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
    H.node "webrtc-media"
        [ HA.id <| "user-" ++ String.fromInt user.id
        , HA.classList
            [ ( "yellow", user.view == Model.Stalled ) ]
        , HA.class <| "video-" ++ viewToString user.view
        , HA.attribute "view" <| viewToString user.view
        , HA.property "browser" <| Json.Encode.string <| userBrowser user.webRtcSupport
        , HA.property "pc" user.pc
        , onCustomEvent "track" (Msg.UserUpdated user.id) Msg.gotTrackDecoder
        , onCustomEvent "video" (Msg.UserUpdated user.id) Msg.videoStateDecoder
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


userBrowser : Model.WebRtcSupport -> String
userBrowser support =
    case support of
        Model.NoWebRtcSupport ->
            "unknown"

        Model.SupportsWebRtc browser _ ->
            browser


onCustomEvent : String -> (m -> Msg) -> Json.Decode.Decoder m -> H.Attribute Msg
onCustomEvent event toMsg decoder =
    HE.on event <|
        Json.Decode.map toMsg (Json.Decode.field "detail" decoder)


header : Html Msg
header =
    H.div [ HA.class "header" ]
        [ btn [ HE.onClick Msg.Leave ] [ H.text "leave" ]
        ]
