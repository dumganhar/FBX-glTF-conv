
#pragma once

#if defined(_MSC_VER)
    // #ifdef  BEE_EXPORT
    //     #define BEE_API __declspec(dllexport)  
    // #else
    //     #define BEE_API __declspec(dllimport)  
    // #endif
    #define BEE_API
#else
    #define BEE_API
    // #pragma warning Unknown dynamic link import/export semantics.
#endif
