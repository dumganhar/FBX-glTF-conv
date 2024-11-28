cmake_minimum_required (VERSION 3.15)

project ("FBX-glTF-conv")

option (POLYFILLS_STD_FILESYSTEM "Use Polyfill <filesystem>" OFF)

message("Generated with config types: ${CMAKE_CONFIGURATION_TYPES}")

# set (POLYFILLS_STD_FILESYSTEM ON)

if(MSVC)
    if(POLICY CMP0091)
      cmake_policy(SET CMP0091 NEW) 
    endif()
endif()

include ("./Cli/CMakeLists.txt")
