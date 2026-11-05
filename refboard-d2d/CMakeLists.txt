cmake_minimum_required(VERSION 3.16)
project(RefBoardHost LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(MSVC)
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

add_executable(RefBoardHost
    src/main.cpp
)

target_compile_options(RefBoardHost PRIVATE /utf-8)

# Feed the DPI-aware manifest to the linker (avoids duplicate MANIFEST:1 from RC + auto-embed)
target_link_options(RefBoardHost PRIVATE
    "/MANIFEST:EMBED"
    "/MANIFESTINPUT:${CMAKE_SOURCE_DIR}/refboard.manifest"
    "/MANIFESTUAC:NO"
)

target_link_libraries(RefBoardHost
    d2d1
    d3d11
    dxgi
    dwrite
    windowscodecs
    comctl32
)

target_compile_definitions(RefBoardHost PRIVATE UNICODE _UNICODE)

if(MINGW)
    target_link_options(RefBoardHost PRIVATE -static -static-libgcc -static-libstdc++ -Wl,--subsystem,windows)
endif()

set_target_properties(RefBoardHost PROPERTIES
    OUTPUT_NAME "RefBoardHost"
    SUFFIX ".exe"
)

install(TARGETS RefBoardHost RUNTIME DESTINATION "${CMAKE_SOURCE_DIR}/../dist/refboard")

# Post-build: copy to dist/refboard/ for electron-builder packaging
add_custom_command(TARGET RefBoardHost POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_SOURCE_DIR}/../dist/refboard"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "$<TARGET_FILE:RefBoardHost>"
    "${CMAKE_SOURCE_DIR}/../dist/refboard/RefBoardHost.exe"
    COMMENT "Copying RefBoardHost.exe to dist/refboard/ for packaging"
)
