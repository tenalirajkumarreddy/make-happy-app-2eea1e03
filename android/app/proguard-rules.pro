# ProGuard rules for Aqua Prime (Capacitor + WebView)
-keep class com.aquaprime.app.** { *; }
-keep class * extends com.getcapacitor.Plugin { *; }
-keep class org.json.** { *; }
-keepattributes *Annotation*, JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
