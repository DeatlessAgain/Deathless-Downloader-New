buildscript {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://jitpack.io") }
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.4.2")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.0")
    }
}

apply(from = "variables.gradle")

extra.apply {
    set("compileSdkVersion", 35)
    set("targetSdkVersion", 35)
    set("minSdkVersion", 24)
}

subprojects {
    extra.apply {
        set("compileSdkVersion", 35)
        set("targetSdkVersion", 35)
        set("minSdkVersion", 24)
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://jitpack.io") }
    }
    configurations.all {
        resolutionStrategy {
            force(
                "org.jetbrains.kotlin:kotlin-stdlib:2.1.0",
                "org.jetbrains.kotlin:kotlin-stdlib-jdk8:2.1.0",
                "org.jetbrains.kotlin:kotlin-stdlib-jdk7:2.1.0",
                "org.jetbrains.kotlin:kotlin-reflect:2.1.0",
                "androidx.core:core:1.13.1",
                "androidx.core:core-ktx:1.13.1",
                "androidx.activity:activity:1.9.1",
                "androidx.activity:activity-ktx:1.9.1",
                "androidx.appcompat:appcompat:1.7.0",
                "androidx.fragment:fragment:1.8.1",
                "androidx.coordinatorlayout:coordinatorlayout:1.2.0"
            )
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
