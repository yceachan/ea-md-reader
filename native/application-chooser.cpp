#include <QApplication>
#include <QCoreApplication>
#include <QFileInfo>
#include <QJsonDocument>
#include <QJsonObject>
#include <QTextStream>
#include <KOpenWithDialog>
#include <KService>
#include <KIO/DesktopExecParser>

static QJsonObject describe(const KService::Ptr &service)
{
    const QFileInfo file(service->entryPath());
    if (!file.isFile() || !file.isReadable() || !service->isApplication() || service->exec().isEmpty()) {
        throw QStringLiteral("所选应用的 desktop 条目不可用。");
    }
    return {{QStringLiteral("program"), file.canonicalFilePath()},
            {QStringLiteral("name"), service->name()},
            {QStringLiteral("executable"), KIO::DesktopExecParser::executablePath(service->exec())}};
}

int main(int argc, char **argv)
{
    try {
        if (argc != 3) throw QStringLiteral("用法：emd-application-chooser choose <mime> | inspect <desktop>");
        const QString action = QString::fromLocal8Bit(argv[1]);
        const QString value = QString::fromLocal8Bit(argv[2]);
        QJsonObject result;
        if (action == QStringLiteral("choose")) {
            QApplication app(argc, argv);
            QCoreApplication::setApplicationName(QStringLiteral("Ea.Md.Reader"));
            // No URLs/MIME association: choosing an editor must not change system defaults.
            KOpenWithDialog dialog;
            dialog.setWindowTitle(value == QStringLiteral("text/markdown")
                ? QStringLiteral("选择 Markdown 编辑器") : QStringLiteral("选择 HTML 编辑器"));
            dialog.hideRunInTerminal();
            dialog.hideNoCloseOnExit();
            dialog.setSaveNewApplications(false);
            if (dialog.exec() != QDialog::Accepted) result = {{QStringLiteral("canceled"), true}};
            else {
                const auto service = dialog.service();
                if (!service) throw QStringLiteral("请从应用程序列表选择已安装的编辑器。");
                result = describe(service);
            }
        } else if (action == QStringLiteral("inspect")) {
            QCoreApplication app(argc, argv);
            result = describe(KService::Ptr(new KService(value)));
        } else throw QStringLiteral("无效的应用程序选择请求。");
        QTextStream(stdout) << QJsonDocument(result).toJson(QJsonDocument::Compact) << Qt::endl;
        return 0;
    } catch (const QString &error) {
        QTextStream(stderr) << error << Qt::endl;
        return 1;
    }
}
