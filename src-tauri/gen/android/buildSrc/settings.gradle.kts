// buildSrc is an independent Gradle build. Plugin dependencies need
// Maven Central as well as the Gradle Plugin Portal (the latter alone
// may not provide transitive Kotlin artifacts such as kotlin-stdlib).
pluginManagement {
    repositories {
        mavenCentral()
        google()
        gradlePluginPortal()
    }
}

rootProject.name = "whatsmo-buildSrc"
