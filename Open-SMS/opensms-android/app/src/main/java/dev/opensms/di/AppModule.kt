package dev.opensms.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
object AppModule
// All @Singleton bindings are provided via @Inject constructors.
// Add @Provides methods here only for third-party classes or
// objects that cannot be annotated directly.
