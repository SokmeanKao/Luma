{
  "targets": [
    {
      "target_name": "win_audio",
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS", "WIN32_LEAN_AND_MEAN", "NOMINMAX"],
      "conditions": [
        [
          "OS=='win'",
          {
            "sources": ["src/win_audio.cc"],
            "libraries": ["-lole32", "-lmmdevapi", "-lavrt"],
            "msvs_settings": {
              "VCCLCompilerTool": {
                "ExceptionHandling": 1,
                "AdditionalOptions": ["/std:c++17"]
              }
            }
          },
          {
            "sources": ["src/win_audio_stub.cc"]
          }
        ]
      ]
    }
  ]
}
