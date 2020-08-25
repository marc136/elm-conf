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
                , Cmd.none
                )

        Msg.UserLeft userId ->
            case Dict.get userId model.users of
                Nothing ->
                    ( model, Cmd.none )

                Just user ->
                    ( { model | users = Dict.remove userId model.users }
                    , case user of
                        Model.User { pc } ->
                            Ports.Out.closeRemotePeerConnection pc

                        _ ->
                            Cmd.none
                    )

        Msg.UserUpdated userId event ->
            case Dict.get userId model.users of
                Just before ->
                    updateUser model.userId model.localStream event before
                        |> Tuple.mapFirst (\user -> Dict.insert userId user model.users)
                        |> Tuple.mapFirst (\users -> { model | users = users })

                Nothing ->
                    ( model, Cmd.none )

        Msg.Leave ->
            -- message is handled before
            ( model, Cmd.none )


updateUser : Msg.UserId -> Model.Stream -> Msg.Updated -> User -> ( User, Cmd msg )
updateUser ownId localStream msg user =
    case user of
        Model.UserWithoutWebRtc ->
            ( user, Cmd.none )

        Model.UserWithoutPeerConnection peer ->
            updatePendingUser ownId localStream msg peer

        Model.User peer ->
            updateActiveUser localStream msg peer
                |> Tuple.mapFirst Model.User


updatePendingUser : Msg.UserId -> Model.Stream -> Msg.Updated -> Model.PendingUser -> ( User, Cmd msg )
updatePendingUser ownId localStream msg user =
    case msg of
        Msg.NewPeerConnection pc ->
            ( { id = user.id
              , pc = pc
              , browser = user.browser
              , audioTrack = Model.NoTrack
              , videoTrack = Model.NoTrack
              , view = Model.Initial
              }
                |> Model.User
            , if user.remoteSdpOffer == Nothing && ownId < user.id then
                Ports.Out.createSdpOfferFor user.id pc localStream

              else
                user.remoteSdpOffer
                    |> Maybe.map
                        (Ports.Out.createSdpAnswerFor user.id pc localStream (List.reverse user.remoteIceCandidates))
                    |> Maybe.withDefault Cmd.none
            )

        Msg.RemoteSdpOffer sdp ->
            ( Model.UserWithoutPeerConnection { user | remoteSdpOffer = Just sdp }, Cmd.none )

        Msg.RemoteIceCandidate candidate ->
            ( { user | remoteIceCandidates = candidate :: user.remoteIceCandidates }
                |> Model.UserWithoutPeerConnection
            , Cmd.none
            )

        _ ->
            ( Model.UserWithoutPeerConnection user, Cmd.none )


updateActiveUser : Model.Stream -> Msg.Updated -> Model.Peer -> ( Model.Peer, Cmd msg )
updateActiveUser localStream msg user =
    case msg of
        Msg.NewPeerConnection pc ->
            -- TODO close old pc and set new one
            ( user, Cmd.none )

        Msg.LocalSdpOffer _ ->
            ( user, Cmd.none )

        Msg.RemoteSdpOffer sdp ->
            ( user
            , Ports.Out.createSdpAnswerFor user.id user.pc localStream [] sdp
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
