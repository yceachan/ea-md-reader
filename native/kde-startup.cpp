#include <QCoreApplication>
#include <QDBusConnection>
#include <QDBusInterface>
#include <QDBusReply>
#include <QJsonDocument>
#include <QJsonObject>
#include <QSocketNotifier>
#include <QTextStream>
#include <QTimer>
#include <unistd.h>

class LayoutBridge : public QObject {
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "io.github.yceachan.Emd.Layout")
public slots:
    void Report(const QString &message) {
        QTextStream(stdout) << message << Qt::endl;
        const QString event = QJsonDocument::fromJson(message.toUtf8()).object().value(QStringLiteral("event")).toString();
        if (event == QStringLiteral("applied") || event == QStringLiteral("error")) QTimer::singleShot(0, QCoreApplication::instance(), &QCoreApplication::quit);
    }
};

int main(int argc, char **argv) {
    QCoreApplication app(argc, argv);
    if (argc != 4) return 1;
    const QString file = QString::fromLocal8Bit(argv[1]), service = QString::fromLocal8Bit(argv[2]), plugin = QString::fromLocal8Bit(argv[3]);
    auto bus = QDBusConnection::sessionBus();
    LayoutBridge bridge;
    if (!bus.registerService(service) || !bus.registerObject(QStringLiteral("/Layout"), &bridge, QDBusConnection::ExportAllSlots)) {
        QTextStream(stderr) << bus.lastError().message() << Qt::endl; return 1;
    }
    QDBusInterface scripting(QStringLiteral("org.kde.KWin"), QStringLiteral("/Scripting"), QStringLiteral("org.kde.kwin.Scripting"), bus);
    const QDBusReply<int> loaded = scripting.call(QStringLiteral("loadScript"), file, plugin);
    if (!loaded.isValid() || loaded.value() < 0) { QTextStream(stderr) << loaded.error().message() << Qt::endl; return 1; }
    QSocketNotifier input(STDIN_FILENO, QSocketNotifier::Read);
#if QT_VERSION >= QT_VERSION_CHECK(6, 0, 0)
    QObject::connect(&input, &QSocketNotifier::activated, [&] { char bytes[64]; if (::read(STDIN_FILENO, bytes, sizeof(bytes)) <= 0) app.quit(); });
#else
    QObject::connect(&input, SIGNAL(activated(int)), &app, SLOT(quit()));
#endif
    QDBusInterface script(QStringLiteral("org.kde.KWin"), QStringLiteral("/Scripting/Script%1").arg(loaded.value()), QStringLiteral("org.kde.kwin.Script"), bus);
    const QDBusMessage started = script.call(QStringLiteral("run"));
    if (started.type() == QDBusMessage::ErrorMessage) { QTextStream(stderr) << started.errorMessage() << Qt::endl; scripting.call(QStringLiteral("unloadScript"), plugin); return 1; }
    QTimer::singleShot(15000, &app, &QCoreApplication::quit);
    const int status = app.exec();
    const QDBusReply<bool> unloaded = scripting.call(QStringLiteral("unloadScript"), plugin);
    if (!unloaded.isValid() || !unloaded.value()) { QTextStream(stderr) << "Cannot unload startup script: " << unloaded.error().message() << Qt::endl; return 1; }
    return status;
}
#include "kde-startup.moc"
