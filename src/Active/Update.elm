module Active.Update exposing (update)

import Active.Init exposing (initUser)
import Active.Messages as Msg exposing (Msg)
import Active.Model as Model exposing (Model, User)
import Dict
import Ports.Out


update : Msg -> Model -> ( Model, Cmd msg )
update msg model =
    case msg of
        Msg.UserJoined u ->
            if u.id == model.userId then
                -- for now the server will not give us new data about oneself
                ( model, Cmd.none )

            else if Dict.member u.id model.users then
                -- for now we do not expect new data about other users
                ( model, Cmd.none )

            else
                -- another user has joined
                ( { model | users = Dict.insert u.id (initUser u) model.users }
                , -- initiate the PeerConnection to her
                  Ports.Out.createSdpOfferFor u.id u.pc model.localStream
                )

        Msg.UserLeft userId ->
            case Dict.get userId model.users of
                Nothing ->
                    ( model, Cmd.none )

                Just user ->
                    ( { model | users = Dict.remove userId model.users }
                    , Ports.Out.closeRemotePeerConnection user.pc
                    )

        Msg.UserUpdated userId event ->
            case Dict.get userId model.users of
                Just before ->
                    activeUpdateUser model.localStream event before
                        |> Tuple.mapFirst (\user -> Dict.insert user.id user model.users)
                        |> Tuple.mapFirst (\users -> { model | users = users })

                Nothing ->
                    ( model, Cmd.none )

        Msg.Leave ->
            -- message is handled before
            ( model, Cmd.none )


activeUpdateUser : Model.Stream -> Msg.Updated -> User -> ( User, Cmd msg )
activeUpdateUser localStream msg user =
    case msg of
        Msg.LocalSdpOffer _ ->
            ( user, Cmd.none )

        Msg.RemoteSdpOffer sdp ->
            ( user
            , Ports.Out.createSdpAnswerFor sdp user.id user.pc localStream
            )

        Msg.LocalSdpAnswer _ ->
            ( user, Cmd.none )

        Msg.RemoteSdpAnswer sdp ->
            ( user
            , Ports.Out.setRemoteSdpAnswer sdp user.id user.pc
            )

        Msg.RemoteIceCandidate candidate ->
            ( user
            , Ports.Out.setRemoteIceCandidate user.id candidate user.pc
            )

        Msg.GotTrack Msg.Audio track ->
            ( { user | audioTrack = Model.MediaTrack track }, Cmd.none )

        Msg.GotTrack Msg.Video track ->
            ( { user | videoTrack = Model.MediaTrack track }, Cmd.none )

        Msg.VideoEvent Msg.Playing ->
            ( { user | view = Model.Playing }, Cmd.none )

        Msg.VideoEvent Msg.Stalled ->
            ( { user | view = Model.Stalled }, Cmd.none )
