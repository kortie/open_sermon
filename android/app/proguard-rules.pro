# App-specific R8 rules (release build, S16).
# Capacitor's consumer rules already keep every Plugin subclass (OnDeviceAi, Coffee, Launch) and its
# @PluginMethod methods, which the bridge finds by reflection. ML Kit and Play Billing ship their own
# consumer rules.

# Keep line numbers for readable crash reports, but hide the original source file names.
# Upload build/outputs/mapping/release/mapping.txt to Play Console with each release.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
