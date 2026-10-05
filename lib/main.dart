import 'package:flutter/material.dart';

void main() {
  runApp(const WalletHookApp());
}

class WalletHookApp extends StatelessWidget {
  const WalletHookApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Wallet Hook',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        scaffoldBackgroundColor: Colors.black,
        fontFamily: 'Roboto',
      ),
      home: const LoginScreen(),
      routes: {
        '/login': (_) => const LoginScreen(),
        '/create': (_) => const CreateAccountScreen(),
        '/forgot': (_) => const ForgotPasswordScreen(),
        '/verify': (_) => const VerifyScreen(),
        '/home': (_) => const HomeScreen(),
      },
    );
  }
}

const _grey = Color(0xFF7D7D7D);

class PhoneFrame extends StatelessWidget {
  final Widget child;
  const PhoneFrame({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 390,
        height: 844,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
        decoration: BoxDecoration(
          color: Colors.black,
          borderRadius: BorderRadius.circular(40),
          boxShadow: const [
            BoxShadow(
              blurRadius: 40,
              color: Colors.black54,
            ),
          ],
        ),
        child: child,
      ),
    );
  }
}

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PhoneFrame(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // top grey bars
            Column(
              children: [
                _greyBar(0.8),
                const SizedBox(height: 10),
                _greyBar(0.7),
                const SizedBox(height: 10),
                _greyBar(0.6),
              ],
            ),
            const SizedBox(height: 40),
            // logo & title
            Column(
              mainAxisSize: MainAxisSize.min,
              children: const [
                _AppLogo(),
                SizedBox(height: 16),
                _UserCircle(),
                SizedBox(height: 8),
                _TitleText('LOGIN'),
              ],
            ),
            const SizedBox(height: 24),
            // card
            Expanded(
              child: Align(
                alignment: Alignment.topCenter,
                child: _CardContainer(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _GreyField(hint: 'Gmail'),
                      const SizedBox(height: 12),
                      _GreyField(hint: 'password', obscure: true),
                      const SizedBox(height: 10),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _LinkText(
                            'forgot password',
                            onTap: () => Navigator.pushNamed(context, '/forgot'),
                          ),
                          _LinkText(
                            'create account',
                            onTap: () => Navigator.pushNamed(context, '/create'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      _SubmitButton(
                        onTap: () => Navigator.pushNamed(context, '/home'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class CreateAccountScreen extends StatelessWidget {
  const CreateAccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PhoneFrame(
        child: Stack(
          children: [
            Column(
              children: [
                const SizedBox(height: 16),
                Column(
                  children: const [
                    _UserCircle(),
                    SizedBox(height: 12),
                    _TitleText('CREATE ACCOUNT'),
                  ],
                ),
                const SizedBox(height: 20),
                _CardContainer(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _GreyField(hint: 'Gmail'),
                      SizedBox(height: 12),
                      _GreyField(hint: 'password', obscure: true),
                      SizedBox(height: 12),
                      _GreyField(hint: 'Confirm password', obscure: true),
                      SizedBox(height: 8),
                      Row(
                        children: [
                          Text(
                            'already have an account ',
                            style: TextStyle(fontSize: 12, color: Colors.black),
                          ),
                          _LinkText(
                            'Login',
                            onTap: () => Navigator.pushReplacementNamed(context, '/login'),
                          ),
                        ],
                      ),
                      SizedBox(height: 16),
                      _SubmitButton(
                        onTap: () => Navigator.pushNamed(context, '/home'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            Positioned(
              bottom: 24,
              left: 0,
              right: 0,
              child: Row(
                children: [
                  const _BottomLogo(),
                  const SizedBox(width: 16),
                  Expanded(child: _greyBarWidget()),
                  const SizedBox(width: 8),
                  Expanded(
                    flex: 2,
                    child: _greyBarWidget(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ForgotPasswordScreen extends StatelessWidget {
  const ForgotPasswordScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PhoneFrame(
        child: Stack(
          children: [
            Column(
              children: [
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: IconButton(
                    icon: const Icon(Icons.chevron_left, color: Colors.white, size: 32),
                    onPressed: () => Navigator.pop(context),
                  ),
                ),
                const SizedBox(height: 8),
                Column(
                  children: const [
                    _AppLogo(size: 120),
                    SizedBox(height: 16),
                    _UserCircle(),
                    SizedBox(height: 8),
                    _TitleText('forgot password', size: 20),
                  ],
                ),
                const SizedBox(height: 24),
                _CardContainer(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _GreyField(hint: 'Gmail'),
                      SizedBox(height: 16),
                      _SubmitButton(
                        onTap: () => Navigator.pushNamed(context, '/verify'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            Positioned(
              bottom: 24,
              left: 0,
              right: 0,
              child: _greyBarWidget(),
            ),
          ],
        ),
      ),
    );
  }
}

class VerifyScreen extends StatelessWidget {
  const VerifyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PhoneFrame(
        child: Stack(
          children: [
            Column(
              children: [
                const SizedBox(height: 8),
                Align(
                  alignment: Alignment.centerLeft,
                  child: IconButton(
                    icon: const Icon(Icons.chevron_left, color: Colors.white, size: 32),
                    onPressed: () => Navigator.pop(context),
                  ),
                ),
                const SizedBox(height: 8),
                Column(
                  children: const [
                    _AppLogo(size: 120),
                    SizedBox(height: 16),
                    _UserCircle(),
                    SizedBox(height: 8),
                    _TitleText('verify', size: 20),
                  ],
                ),
                const SizedBox(height: 24),
                _CardContainer(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _GreyField(hint: 'enter verification code'),
                      SizedBox(height: 12),
                      _GreyField(hint: 'new password', obscure: true),
                      SizedBox(height: 12),
                      _GreyField(hint: 'Confirm password', obscure: true),
                      SizedBox(height: 16),
                      _SubmitButton(
                        onTap: () => Navigator.pushNamed(context, '/home'),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            Positioned(
              bottom: 24,
              left: 0,
              right: 0,
              child: Center(
                child: SizedBox(width: 140, child: _greyBarWidget()),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PhoneFrame(
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(26),
          ),
          child: Stack(
            children: [
              Positioned(
                top: 16,
                left: 8,
                child: IconButton(
                  icon: const Icon(Icons.chevron_left, color: Colors.black, size: 32),
                  onPressed: () => Navigator.pushReplacementNamed(context, '/login'),
                ),
              ),
              Positioned(
                top: 80,
                left: -40,
                right: -40,
                child: Container(
                  height: 360,
                  decoration: const BoxDecoration(
                    color: _grey,
                    shape: BoxShape.circle,
                  ),
                ),
              ),
              Column(
                children: [
                  const SizedBox(height: 60),
                  const Text(
                    'WELCOME',
                    style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'SELECT THE SERVICE',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      letterSpacing: 1,
                    ),
                  ),
                  const SizedBox(height: 40),
                  _ServiceButton(label: 'BUDGETING'),
                  _ServiceButton(label: 'PLANNING'),
                  _ServiceButton(label: 'SAVINGS'),
                  _ServiceButton(label: 'ADVICES'),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/* Reusable widgets */

Widget _greyBar(double widthFactor) {
  return FractionallySizedBox(
    widthFactor: widthFactor,
    child: _greyBarWidget(),
  );
}

Widget _greyBarWidget() {
  return Container(
    height: 24,
    decoration: BoxDecoration(
      color: _grey,
      borderRadius: BorderRadius.circular(12),
    ),
  );
}

class _AppLogo extends StatelessWidget {
  final double size;
  const _AppLogo({this.size = 140});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(32),
      ),
      alignment: Alignment.center,
      child: const Text(
        'WALLET\nHOOK',
        textAlign: TextAlign.center,
        style: TextStyle(
          color: Colors.black,
          fontWeight: FontWeight.bold,
          fontSize: 18,
        ),
      ),
    );
  }
}

class _UserCircle extends StatelessWidget {
  const _UserCircle();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white, width: 4),
      ),
      alignment: Alignment.center,
      child: const Icon(Icons.person, color: Colors.white, size: 28),
    );
  }
}

class _TitleText extends StatelessWidget {
  final String text;
  final double size;
  const _TitleText(this.text, {this.size = 24});

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: TextStyle(
        fontSize: size,
        letterSpacing: 1,
        fontWeight: FontWeight.w700,
        color: Colors.white,
      ),
    );
  }
}

class _CardContainer extends StatelessWidget {
  final Widget child;
  const _CardContainer({required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 20),
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 28),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
      ),
      child: child,
    );
  }
}

class _GreyField extends StatelessWidget {
  final String hint;
  final bool obscure;
  const _GreyField({required this.hint, this.obscure = false});

  @override
  Widget build(BuildContext context) {
    return TextField(
      obscureText: obscure,
      style: const TextStyle(color: Colors.white, fontSize: 14),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Colors.white70),
        filled: true,
        fillColor: _grey,
        border: InputBorder.none,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
    );
  }
}

class _LinkText extends StatelessWidget {
  final String text;
  final VoidCallback onTap;
  const _LinkText(this.text, {required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 12,
          color: Colors.black,
          decoration: TextDecoration.underline,
        ),
      ),
    );
  }
}

class _SubmitButton extends StatelessWidget {
  final VoidCallback onTap;
  const _SubmitButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.black,
          borderRadius: BorderRadius.circular(999),
        ),
        child: const Text(
          'Submit',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white),
        ),
      ),
    );
  }
}

class _BottomLogo extends StatelessWidget {
  const _BottomLogo();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 90,
      height: 90,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
      ),
      alignment: Alignment.center,
      child: const Text(
        'WALLET\nHOOK',
        textAlign: TextAlign.center,
        style: TextStyle(
          color: Colors.black,
          fontSize: 10,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}

class _ServiceButton extends StatelessWidget {
  final String label;
  const _ServiceButton({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 260,
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(
        color: _grey,
        borderRadius: BorderRadius.circular(16),
      ),
      alignment: Alignment.center,
      child: Text(
        label,
        style: const TextStyle(
          fontWeight: FontWeight.w600,
          color: Colors.black,
        ),
      ),
    );
  }
}