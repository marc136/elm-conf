module Active exposing
    ( Model
    , Msg
    , init
    , update
    , view
    )

import Active.Init
import Active.Messages
import Active.Model
import Active.Update
import Active.View
import Helpers.View exposing (KeyedHtmlList)
import Json.Decode as Json
import Ports.In


type alias Model =
    Active.Model.Model


type alias Msg =
    Active.Messages.Msg


view : Model -> KeyedHtmlList Msg
view =
    Active.View.view


init : Ports.In.JoinSuccess -> String -> Json.Value -> Model
init =
    Active.Init.init


update : Msg -> Model -> ( Model, Cmd msg )
update =
    Active.Update.update
