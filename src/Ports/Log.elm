port module Ports.Log exposing (debug, error, info, warn)

import Json.Encode as Json


debug : String -> Cmd msg
debug =
    log "debug"


info : String -> Cmd msg
info =
    log "info"


warn : String -> Cmd msg
warn =
    log "warn"


error : String -> Cmd msg
error =
    log "error"


log : String -> String -> Cmd msg
log level message =
    [ ( "level", Json.string level )
    , ( "message", Json.string message )
    ]
        |> Json.object
        |> logs


port logs : Json.Value -> Cmd msg
