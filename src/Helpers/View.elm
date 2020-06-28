module Helpers.View exposing
    ( KeyedHtmlList
    , btn
    , keyedNode
    )

import Html exposing (Html)
import Html.Attributes exposing (type_)
import Html.Keyed


btn : List (Html.Attribute msg) -> List (Html msg) -> Html msg
btn attr children =
    Html.button (type_ "button" :: attr) children


type alias KeyedHtmlList msg =
    ( List (Html.Attribute msg), List ( String, Html msg ) )


keyedNode : String -> KeyedHtmlList msg -> Html msg
keyedNode tagName ( attr, children ) =
    Html.Keyed.node tagName attr children
