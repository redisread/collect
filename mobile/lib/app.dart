import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/register_screen.dart';
import 'screens/article_detail_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/translation_history_screen.dart';
import 'providers/auth_provider.dart';

class CollectApp extends ConsumerWidget {
  const CollectApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = GoRouter(
      initialLocation: '/',
      redirect: (context, state) {
        final authState = ref.read(authProvider);
        final isLoggedIn = authState.valueOrNull?.isLoggedIn ?? false;
        final isLoginRoute = state.matchedLocation == '/login' ||
            state.matchedLocation == '/register';

        if (!isLoggedIn && !isLoginRoute) return '/login';
        if (isLoggedIn && isLoginRoute) return '/';
        return null;
      },
      routes: [
        GoRoute(path: '/', builder: (ctx, state) => const HomeScreen()),
        GoRoute(path: '/login', builder: (ctx, state) => const LoginScreen()),
        GoRoute(
            path: '/register',
            builder: (ctx, state) => const RegisterScreen()),
        GoRoute(
          path: '/article/:id',
          builder: (ctx, state) =>
              ArticleDetailScreen(articleId: state.pathParameters['id']!),
        ),
        GoRoute(
            path: '/settings',
            builder: (ctx, state) => const SettingsScreen()),
        GoRoute(
            path: '/translations',
            builder: (ctx, state) => const TranslationHistoryScreen()),
      ],
    );

    return MaterialApp.router(
      title: 'Collect',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFFF6B35),
          brightness: Brightness.light,
        ),
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFFF6B35),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      routerConfig: router,
    );
  }
}
